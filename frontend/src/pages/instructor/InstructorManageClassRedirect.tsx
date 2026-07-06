import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

export function InstructorManageClassRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/instructor/sections')
      .then((res) => {
        const sections = res.data ?? []
        if (sections.length > 0) {
          navigate(`/instructor/classes/${sections[0].id}/students`, { replace: true })
        } else {
          toast.error('Bạn chưa được phân công lớp học phần nào.')
          navigate('/instructor/classes', { replace: true })
        }
      })
      .catch(() => {
        navigate('/instructor/classes', { replace: true })
      })
  }, [navigate])

  return <PageLoader label="Đang kết nối đến trang quản lý lớp học..." />
}
